import { showAlert, showConfirm, showPrompt, showToast } from '../utils/dialogService';

export const useDialog = () => {
    return {
        alert: showAlert,
        confirm: showConfirm,
        prompt: showPrompt,
        toast: showToast
    };
};

export default useDialog;

