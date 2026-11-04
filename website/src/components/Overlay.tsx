import {createPortal} from 'react-dom';
import { useRef, type ReactNode } from 'react';
import { useFocusScope } from './useFocusScope';
export function Overlay({
  children,
  onClose,
  portal=false,
}: {
  children: ReactNode;
  onClose: () => void;
  portal?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusScope(true, onClose, ref);
  const content = (
    <div
      className="modal-backdrop"
      ref={ref}
      tabIndex={-1}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
  return portal ? createPortal(content,document.body) : content;
}
