import { BrowserMultiFormatReader } from '@zxing/library';

let reader: BrowserMultiFormatReader | null = null;

export function getReader(): BrowserMultiFormatReader {
  if (!reader) reader = new BrowserMultiFormatReader();
  return reader;
}

export async function startScan(
  videoEl: HTMLVideoElement,
  onResult: (barcode: string) => void,
  onError: (err: Error) => void
): Promise<void> {
  const r = getReader();
  try {
    await r.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      videoEl,
      (result) => {
        // Callback errors are always NotFoundException ("no barcode in this frame") —
        // a normal per-frame signal, not a real error. Ignore them.
        if (result) { onResult(result.getText()); r.reset(); }
      }
    );
  } catch (err) {
    // Promise rejections are real camera errors (permission denied, no device, etc.)
    onError(err as Error);
  }
}

export function stopScan(): void {
  reader?.reset();
}
