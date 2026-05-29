import { useEffect, useRef, useState } from 'react';
import { startScan, stopScan } from '../lib/barcode.js';
import { Button } from './ui/Button.js';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    startScan(
      videoRef.current,
      (barcode) => { onScan(barcode); onClose(); },
      (err) => {
        console.error('Scan error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Please allow camera access and try again.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError('Could not start camera. ' + err.message);
        }
      }
    );
    return () => stopScan();
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-white font-medium">Scan Barcode</h2>
        <button onClick={onClose} className="text-white min-h-[44px] min-w-[44px] flex items-center justify-center text-xl">✕</button>
      </div>
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
            <p className="text-white text-sm text-center">{error}</p>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-40 border-2 border-white rounded-lg opacity-70" />
          </div>
        )}
      </div>
      {!error && (
        <div className="p-4 text-center">
          <p className="text-white text-sm opacity-70">Point camera at barcode</p>
          <Button variant="secondary" onClick={onClose} className="mt-3">Cancel</Button>
        </div>
      )}
    </div>
  );
}
