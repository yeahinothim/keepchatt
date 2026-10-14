import React, { useState, useEffect } from 'react';
import { AlertCircle, HelpCircle, CheckCircle2, X } from 'lucide-react';

interface CustomPopupModalProps {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'prompt';
  title?: string;
  message: string;
  defaultValue?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export function CustomPopupModal({
  isOpen,
  type,
  title,
  message,
  defaultValue = '',
  onConfirm,
  onCancel,
}: CustomPopupModalProps) {
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    setInputValue(defaultValue);
  }, [defaultValue, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/50">
          <div className="flex items-center gap-2.5">
            {type === 'alert' && <AlertCircle className="w-5 h-5 text-amber-500" />}
            {type === 'confirm' && <HelpCircle className="w-5 h-5 text-blue-500" />}
            {type === 'prompt' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
            <h3 className="font-semibold text-neutral-100 text-base">
              {title || (type === 'alert' ? 'Notification' : type === 'confirm' ? 'Confirmation' : 'Input Required')}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-200 transition p-1 rounded-lg hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">{message}</p>

          {type === 'prompt' && (
            <input
              type="text"
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onConfirm(inputValue);
                } else if (e.key === 'Escape') {
                  onCancel();
                }
              }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-sm text-neutral-100 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600"
              placeholder="Enter value..."
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-neutral-800 bg-neutral-950/30">
          {type !== 'alert' && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 transition"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              if (type === 'prompt') {
                onConfirm(inputValue);
              } else {
                onConfirm();
              }
            }}
            autoFocus={type !== 'prompt'}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 transition shadow-xs"
          >
            {type === 'confirm' ? 'Confirm' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
