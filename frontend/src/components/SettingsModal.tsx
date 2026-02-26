import React from 'react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    transparency: number;
    onTransparencyChange: (value: number) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    transparency,
    onTransparencyChange,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-96 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-6">
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-gray-700">
                                Unselected Object Transparency
                            </label>
                            <span className="text-sm text-gray-500">{transparency}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={transparency}
                            onChange={(e) => onTransparencyChange(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Higher values make unselected objects more transparent.
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
