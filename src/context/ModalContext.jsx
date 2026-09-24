/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
  // Alert Modal State
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info', // 'info' | 'success' | 'error' | 'warning'
    onClose: null,
  });

  // Confirm Modal State
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDanger: false,
    onConfirm: null,
    onCancel: null,
  });

  const showAlert = useCallback(({ title = 'Notice', message, type = 'info', onClose = null }) => {
    setAlertState({
      isOpen: true,
      title,
      message,
      type,
      onClose,
    });
  }, []);

  const closeAlert = useCallback(() => {
    if (alertState.onClose) alertState.onClose();
    setAlertState(prev => ({ ...prev, isOpen: false }));
  }, [alertState]);

  const showConfirm = useCallback(({
    title = 'Confirm Action',
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDanger = false,
    onConfirm,
    onCancel = null
  }) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      isDanger,
      onConfirm,
      onCancel,
    });
  }, []);

  const closeConfirm = useCallback(() => {
    if (confirmState.onCancel) confirmState.onCancel();
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, [confirmState]);

  const handleConfirmAction = useCallback(() => {
    if (confirmState.onConfirm) confirmState.onConfirm();
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, [confirmState]);

  const getAlertIcon = () => {
    switch (alertState.type) {
      case 'success':
        return <CheckCircle2 size={24} className="text-emerald-500" />;
      case 'error':
        return <AlertTriangle size={24} className="text-red-500" />;
      case 'warning':
        return <AlertCircle size={24} className="text-amber-500" />;
      default:
        return <Info size={24} className="text-blue-500" />;
    }
  };

  const getAlertIconBg = () => {
    switch (alertState.type) {
      case 'success':
        return 'bg-emerald-100 dark:bg-emerald-950/50';
      case 'error':
        return 'bg-red-100 dark:bg-red-950/50';
      case 'warning':
        return 'bg-amber-100 dark:bg-amber-950/50';
      default:
        return 'bg-blue-100 dark:bg-blue-950/50';
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {/* GLOBAL THEMED ALERT MODAL */}
      {alertState.isOpen && (
        <div className="fixed inset-0 z-100000 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${getAlertIconBg()}`}>
                  {getAlertIcon()}
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {alertState.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeAlert}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg outline-none cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              {alertState.message}
            </p>

            <button
              type="button"
              onClick={closeAlert}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* GLOBAL THEMED CONFIRM MODAL */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-100000 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2.5 rounded-2xl ${confirmState.isDanger ? 'bg-red-100 dark:bg-red-950/50 text-red-500' : 'bg-blue-100 dark:bg-blue-950/50 text-blue-500'}`}>
                {confirmState.isDanger ? <AlertTriangle size={24} /> : <Info size={24} />}
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {confirmState.title}
              </h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              {confirmState.message}
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeConfirm}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                {confirmState.cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`flex-1 py-3 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                  confirmState.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const useModal = () => useContext(ModalContext);