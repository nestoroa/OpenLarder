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
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    const rear = devices.find(d => /back|rear|environment/i.test(d.label));
    const deviceId = rear?.deviceId ?? devices[0]?.deviceId;
    r.decodeFromVideoDevice(deviceId ?? null, videoEl, (result, err) => {
      if (result) { onResult(result.getText()); r.reset(); }
      else if (err && err.name !== 'NotFoundException') onError(err as Error);
    });
  } catch (err) {
    onError(err as Error);
  }
}

export function stopScan(): void {
  reader?.reset();
}
