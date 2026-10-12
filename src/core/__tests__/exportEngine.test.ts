import { describe, expect, it } from 'vitest';
import { ExportEngine } from '../exportEngine';

describe('ExportEngine.buildFFmpegCommand', () => {
  it('only re-encodes an already composed recording', () => {
    const cmd = ExportEngine.buildFFmpegCommand({
      inputFile: 'in.webm',
      outputFile: 'out.mp4',
      layout: 'recorded_canvas',
      watermark: false
    });
    expect(cmd).not.toContain('crop=');
    expect(cmd).toContain('-c:v libx264');
  });

  it('quotes file names so spaces and quotes cannot break the command', () => {
    const cmd = ExportEngine.buildFFmpegCommand({
      inputFile: 'my "take".webm',
      outputFile: 'out file.mp4',
      layout: 'recorded_canvas',
      watermark: false
    });
    expect(cmd).toContain('"my \\"take\\".webm"');
    expect(cmd).toContain('"out file.mp4"');
  });

  it('falls back to a safe bitrate when given something else', () => {
    const cmd = ExportEngine.buildFFmpegCommand({
      inputFile: 'a',
      outputFile: 'b',
      layout: 'recorded_canvas',
      watermark: false,
      bitrate: '5M; rm -rf /'
    });
    expect(cmd).toContain('-b:v 14M');
  });

  it('escapes watermark text for the drawtext filter', () => {
    const cmd = ExportEngine.buildFFmpegCommand({
      inputFile: 'a',
      outputFile: 'b',
      layout: 'recorded_canvas',
      watermark: true,
      watermarkText: "it's: here"
    });
    expect(cmd).toContain("text='it\\'s\\: here'");
  });
});

describe('ExportEngine.extensionFor', () => {
  it('maps the recorder mime type to a file extension', () => {
    expect(ExportEngine.extensionFor(new Blob([], { type: 'video/mp4' }))).toBe('mp4');
    expect(ExportEngine.extensionFor(new Blob([], { type: 'video/webm' }))).toBe('webm');
  });
});
