import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserFileIO,
  EXCEL_KIND,
  PROJECT_JSON_KIND,
} from './fileIO';

// File System Access API は jsdom に無いため、必要な範囲だけ型を付けて差し込む。
interface WritableDouble {
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  abort?: ReturnType<typeof vi.fn>;
}

interface PickerTestWindow extends Window {
  showSaveFilePicker?: () => Promise<{ createWritable: () => Promise<WritableDouble> }>;
  showOpenFilePicker?: () => Promise<Array<{ getFile: () => Promise<{ text: () => Promise<string> }> }>>;
}

const testWindow = window as PickerTestWindow;

function makeWritable(): WritableDouble {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function abortError(): Error {
  const error = new Error('The user aborted a request.');
  error.name = 'AbortError';
  return error;
}

let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  delete testWindow.showSaveFilePicker;
  delete testWindow.showOpenFilePicker;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  anchorClick.mockRestore();
  delete testWindow.showSaveFilePicker;
  delete testWindow.showOpenFilePicker;
  vi.restoreAllMocks();
});

describe('browserFileIO.saveText', () => {
  it('writes text through the file picker', async () => {
    const writable = makeWritable();
    const createWritable = vi.fn().mockResolvedValue(writable);
    const picker = vi.fn().mockResolvedValue({ createWritable });
    testWindow.showSaveFilePicker = picker;

    const outcome = await browserFileIO.saveText('project.json', '{"a":1}', PROJECT_JSON_KIND);

    expect(outcome).toBe('saved');
    expect(picker).toHaveBeenCalledWith({
      suggestedName: 'project.json',
      types: [
        {
          description: 'Project JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    expect(writable.write).toHaveBeenCalledWith('{"a":1}');
    expect(writable.close).toHaveBeenCalledTimes(1);
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it('returns canceled without downloading when the picker is aborted', async () => {
    testWindow.showSaveFilePicker = vi.fn().mockRejectedValue(abortError());

    const outcome = await browserFileIO.saveText('project.json', '{}', PROJECT_JSON_KIND);

    expect(outcome).toBe('canceled');
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it('falls back to a download when the picker is unavailable', async () => {
    const outcome = await browserFileIO.saveText('project.json', '{"a":1}', PROJECT_JSON_KIND);

    expect(outcome).toBe('saved');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });

  it('aborts the writable and rethrows when writing fails', async () => {
    const writable = makeWritable();
    writable.write.mockRejectedValue(new Error('disk full'));
    writable.abort = vi.fn().mockResolvedValue(undefined);
    testWindow.showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue(writable),
    });

    await expect(
      browserFileIO.saveText('project.json', '{}', PROJECT_JSON_KIND)
    ).rejects.toThrow('disk full');
    expect(writable.abort).toHaveBeenCalledTimes(1);
    expect(anchorClick).not.toHaveBeenCalled();
  });
});

describe('browserFileIO.saveBinary', () => {
  it('opens the picker before producing the bytes', async () => {
    const order: string[] = [];
    const writable = makeWritable();
    writable.write.mockImplementation(async () => {
      order.push('write');
    });
    const handle = {
      createWritable: async () => {
        order.push('createWritable');
        return writable;
      },
    };
    testWindow.showSaveFilePicker = (async () => {
      order.push('picker');
      return handle;
    }) as unknown as PickerTestWindow['showSaveFilePicker'];

    const outcome = await browserFileIO.saveBinary('gantt.xlsx', EXCEL_KIND, async () => {
      order.push('produce');
      return new Uint8Array([1, 2, 3]);
    });

    expect(outcome).toBe('saved');
    // ユーザーアクティベーションを消費しないよう、ピッカーが最初に開く。
    expect(order).toEqual(['picker', 'produce', 'createWritable', 'write']);
    expect(writable.write).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });

  it('does not generate bytes when the picker is aborted', async () => {
    testWindow.showSaveFilePicker = vi.fn().mockRejectedValue(abortError());
    const produce = vi.fn().mockResolvedValue(new Uint8Array([1]));

    const outcome = await browserFileIO.saveBinary('gantt.xlsx', EXCEL_KIND, produce);

    expect(outcome).toBe('canceled');
    expect(produce).not.toHaveBeenCalled();
  });

  it('falls back to a download when the picker is unavailable', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4]);

    const outcome = await browserFileIO.saveBinary('gantt.xlsx', EXCEL_KIND, bytes);

    expect(outcome).toBe('saved');
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe(EXCEL_KIND.mime);
    expect(blob.size).toBe(4);
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });
});

describe('browserFileIO.openText', () => {
  it('reads text through the file picker', async () => {
    const text = vi.fn().mockResolvedValue('{"a":1}');
    testWindow.showOpenFilePicker = vi
      .fn()
      .mockResolvedValue([{ getFile: async () => ({ text }) }]);

    await expect(browserFileIO.openText(PROJECT_JSON_KIND)).resolves.toBe('{"a":1}');
    expect(text).toHaveBeenCalledTimes(1);
  });

  it('returns null when the picker is aborted', async () => {
    testWindow.showOpenFilePicker = vi.fn().mockRejectedValue(abortError());

    await expect(browserFileIO.openText(PROJECT_JSON_KIND)).resolves.toBeNull();
  });

  it('falls back to a file input and returns null on cancel', async () => {
    const promise = browserFileIO.openText(PROJECT_JSON_KIND);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.accept).toBe('.json');
    input?.dispatchEvent(new Event('cancel'));

    await expect(promise).resolves.toBeNull();
  });

  it('falls back to a file input when the picker throws a security error', async () => {
    const error = new Error('blocked');
    error.name = 'SecurityError';
    testWindow.showOpenFilePicker = vi.fn().mockRejectedValue(error);

    const promise = browserFileIO.openText(PROJECT_JSON_KIND);

    // ピッカーの失敗は非同期に返るため、フォールバックの input 生成を待つ
    const input = await vi.waitFor(() => {
      const element = document.querySelector<HTMLInputElement>('input[type="file"]');
      expect(element).not.toBeNull();
      return element!;
    });
    input.dispatchEvent(new Event('cancel'));

    await expect(promise).resolves.toBeNull();
  });
});
