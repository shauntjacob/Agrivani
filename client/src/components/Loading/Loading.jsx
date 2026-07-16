import React from 'react';
import './Loading.css';

const Loading = () => {
  return (
    <div className="loading-container">
      <div className="loading-content">
        <div className="loading-spinner"></div>
        <div className="loading-text">
          <span className="dot">.</span>
          <span className="dot">.</span>
          <span className="dot">.</span>
        </div>
      </div>
    </div>
  );
};

export default Loading;
