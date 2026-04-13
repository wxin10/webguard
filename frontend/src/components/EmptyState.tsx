import React from 'react';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    text: string;
    onClick: () => void;
  };
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="text-6xl mb-6">{icon}</div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-secondary-400 mb-8 max-w-md">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
        >
          {action.text}
        </button>
      )}
    </div>
  );
};

export default EmptyState;