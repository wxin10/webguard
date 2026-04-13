import React from 'react';

interface JsonViewerCardProps {
  title: string;
  data: any;
}

const JsonViewerCard: React.FC<JsonViewerCardProps> = ({ title, data }) => {
  const formattedJson = JSON.stringify(data, null, 2);

  return (
    <div className="bg-secondary-700 rounded-lg p-6 border border-secondary-600">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="bg-secondary-800 rounded-lg p-4 border border-secondary-600 overflow-auto max-h-96">
        <pre className="text-secondary-300 text-sm">{formattedJson}</pre>
      </div>
    </div>
  );
};

export default JsonViewerCard;