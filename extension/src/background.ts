import {
  ALL_PAGES,
  CONFIG_KEY,
  IDLE_STATE,
  Message,
  PENDING_KEY,
  PendingRecording,
  RecState,
  STATE_KEY,
  StreamIdResponse,
  getState,
  send,
  setState
} from './shared';

// The service worker only orchestrates. Capture, compositing and encoding run in the recorder tab,
// because a worker can't hold media streams and gets shut down when idle.

const recorderUrl = chrome.runtime.getURL('recorder.html');

const CONTROLS_SCRIPT_ID = 'clipdesk-controls';

const inject = (tabId: number) =>
  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});

/**
 * Puts the controls and pointer tracking into pages for the length of a recording. With the optional
 * site access granted they go into every open tab and every page loaded until the recording ends;
 * without it only into the tab the user started from, which the toolbar click granted via activeTab.
 */
async function injectControls(originTabId: number): Promise<void> {
  if (!(await chrome.permissions.contains(ALL_PAGES))) {
    await inject(originTabId);
    return;
  }
  const tabs = await chrome.tabs.query({ url: ALL_PAGES.origins });
  await Promise.all(tabs.map((t) => (t.id === undefined ? undefined : inject(t.id))));
  await removeControlsScript();
  await chrome.scripting
    .registerContentScripts([
      { id: CONTROLS_SCRIPT_ID, matches: ALL_PAGES.origins!, js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: false }
    ])
    .catch(() => {});
}

async function removeControlsScript(): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTROLS_SCRIPT_ID] }).catch(() => []);
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTROLS_SCRIPT_ID] }).catch(() => {});
}

async function startRecording(msg: Extract<Message, { type: 'start' }>): Promise<void> {
  const current = await getState();
  if (current.status !== 'idle') return;

  await chrome.storage.local.set({ [CONFIG_KEY]: msg.config });
  const pending: PendingRecording = { config: msg.config, originTabId: msg.tabId };
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
  await setState({
    ...IDLE_STATE,
    status: 'starting',
    camera: msg.config.camera,
    showControls: msg.config.showControls,
    targetTabId: msg.config.source === 'tab' ? msg.tabId : undefined
  });
  await injectControls(msg.tabId);

  // The screen picker is a dialog on the recorder tab, so that tab must be in front while it is open.
  // For tab capture there is no picker and the user stays on their page.
  const recorder = await chrome.tabs.create({
    url: recorderUrl,
    pinned: true,
    active: msg.config.source === 'screen',
    index: 0
  });
  await setState({ recorderTabId: recorder.id });
}

async function streamIdFor(sender: chrome.runtime.MessageSender): Promise<StreamIdResponse> {
  const got = await chrome.storage.local.get(PENDING_KEY);
  const pending = got[PENDING_KEY] as PendingRecording | undefined;
  const recorderTab = sender.tab;
  if (!pending || !recorderTab?.id) return { ok: false, error: 'No recording was requested.' };
  await chrome.storage.local.remove(PENDING_KEY);
  const { config, originTabId } = pending;

  if (config.source === 'tab') {
    try {
      const consumerTabId = recorderTab.id;
      const streamId = await new Promise<string>((resolve, reject) =>
        chrome.tabCapture.getMediaStreamId({ targetTabId: originTabId, consumerTabId }, (id) =>
          chrome.runtime.lastError || !id ? reject(new Error(chrome.runtime.lastError?.message ?? 'no stream id')) : resolve(id)
        )
      );
      return { ok: true, streamId, source: 'tab', canRequestAudio: true, originTabId, targetTabId: originTabId, config };
    } catch (e) {
      return {
        ok: false,
        error: `This tab can't be recorded (${e instanceof Error ? e.message : String(e)}). Chrome pages and the Web Store can't be captured; try another tab or choose Screen.`
      };
    }
  }

  return new Promise((resolve) => {
    chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab', 'audio'], recorderTab, (streamId, options) => {
      if (!streamId) resolve({ ok: false, error: 'cancelled' });
      else resolve({ ok: true, streamId, source: 'screen', canRequestAudio: !!options?.canRequestAudioTrack, originTabId, config });
    });
  });
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  if (msg.type === 'start') {
    void startRecording(msg).then(() => sendResponse(true));
    return true;
  }
  if (msg.type === 'getStreamId') {
    void streamIdFor(sender).then(sendResponse);
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-pause') void send({ type: 'control', action: 'togglePause' });
  else if (command === 'stop-recording') void send({ type: 'control', action: 'stop' });
});

// Toolbar badge mirrors the recording state
function paintBadge(s: RecState): void {
  const text = s.status === 'recording' ? 'REC' : s.status === 'paused' ? '❚❚' : s.status === 'countdown' ? '…' : '';
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color: s.status === 'paused' ? '#f59e0b' : '#e11d48' });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STATE_KEY]) return;
  const next: RecState = { ...IDLE_STATE, ...changes[STATE_KEY].newValue };
  paintBadge(next);
  // Stop putting the controls into newly loaded pages once the recording is over
  if (next.status === 'idle') void removeControlsScript();
});

// Closing the recorder tab ends the recording; don't leave the bar and badge stuck on "recording"
chrome.tabs.onRemoved.addListener((tabId) => {
  void getState().then((s) => {
    if (s.recorderTabId === tabId && s.status !== 'idle') void setState({ ...IDLE_STATE });
  });
});

async function resetIfOrphaned(): Promise<void> {
  const s = await getState();
  if (s.status === 'idle') return paintBadge(s);
  const alive = s.recorderTabId !== undefined && (await chrome.tabs.get(s.recorderTabId).catch(() => null));
  if (!alive) await setState({ ...IDLE_STATE });
  else paintBadge(s);
}

chrome.runtime.onStartup.addListener(() => void resetIfOrphaned());
chrome.runtime.onInstalled.addListener(() => void resetIfOrphaned());
