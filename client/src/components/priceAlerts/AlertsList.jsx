import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCachedAlert, getCachedAlerts, cacheAlerts } from '../../lib/db';
import './priceAlerts.css';

// 🔹 MOVE THIS OUTSIDE THE COMPONENT (or keep inside, either works)
const getDeviceId = () => {
  let deviceId = localStorage.getItem('agrivani_device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('agrivani_device_id', deviceId);
  }
  return deviceId;
};

const AlertsList = ({ alerts, language, onDelete }) => {
  const [cachedAlerts, setCachedAlerts] = useState([]);
  const queryClient = useQueryClient();

  const strings = language === 'mr-IN' ? {
    noAlerts: 'कोणतेही अलर्ट नाहीत',
    createFirst: 'तुमचा पहिला किंमत अलर्ट तयार करा!',
    active: 'सक्रिय',
    triggered: 'ट्रिगर झाले',
    condition: 'अट',
    targetPrice: 'लक्ष्य किंमत',
    above: 'वरील',
    below: 'खालील',
    triggeredAt: 'ट्रिगर झाले',
    actualPrice: 'वास्तविक किंमत',
    created: 'तयार केले',
    cancel: 'रद्द करा',
    delete: 'डिलीट करा',
    deleting: 'डिलीट होत आहे...',
  } : {
    noAlerts: 'No alerts yet',
    createFirst: 'Create your first price alert!',
    active: 'Active',
    triggered: 'Triggered',
    condition: 'Condition',
    targetPrice: 'Target Price',
    above: 'above',
    below: 'below',
    triggeredAt: 'Triggered at',
    actualPrice: 'Actual Price',
    created: 'Created',
    cancel: 'Cancel',
    delete: 'Delete',
    deleting: 'Deleting...',
  };

  // Load cached alerts immediately on mount
  useEffect(() => {
    const loadCached = async () => {
      const cached = await getCachedAlerts();
      setCachedAlerts(cached);
    };
    loadCached();
  }, []);

  // Update cache when server data changes
  useEffect(() => {
    if (alerts && alerts.length > 0) {
      cacheAlerts(alerts);
      setCachedAlerts(alerts);
    }
  }, [alerts]);

  // Use cached data if server data not loaded yet
  const displayAlerts = alerts || cachedAlerts;

  const deleteMutation = useMutation({
    mutationFn: async (alertId) => {
      // Delete from IndexedDB immediately (optimistic)
      await deleteCachedAlert(alertId);
      setCachedAlerts(prev => prev.filter(a => a._id !== alertId));

      // Delete from MongoDB server
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/prices/alerts/${alertId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to delete alert');

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      if (onDelete) onDelete();
    },
    onError: (error, alertId) => {
      console.error('Delete failed, restoring cache:', error);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    }
  });

  const handleDelete = (alertId) => {
    deleteMutation.mutate(alertId);
  };

  if (!displayAlerts || displayAlerts.length === 0) {
    return (
      <div className="noDataCard" style={{ padding: '60px 24px', borderStyle: 'dashed' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔔</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          {strings.noAlerts}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
          {strings.createFirst}
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-grid">
      {displayAlerts.map((alert) => {
        const isTriggered = !alert.isActive && alert.triggeredAt;

        return (
          <div
            key={alert._id}
            className={`alert-item-card elevation-hover ${isTriggered ? 'triggered' : ''}`}
          >
            {/* Header */}
            <div className="alert-item-header">
              <div className="alert-item-title">
                {alert.cropName}
                {isTriggered ? (
                  <span className="status-badge triggered">
                    {strings.triggered}
                  </span>
                ) : (
                  <span className="status-badge active" style={{ animation: 'pulse 2s infinite' }}>
                    {strings.active}
                  </span>
                )}
              </div>

              {/* Delete Button */}
              <button
                onClick={() => handleDelete(alert._id)}
                disabled={deleteMutation.isPending}
                className="agri-btn-danger"
              >
                {deleteMutation.isPending ? strings.deleting : (isTriggered ? strings.delete : strings.cancel)}
              </button>
            </div>

            {/* Alert Details */}
            <div className="alert-details-grid">
              {/* Condition */}
              <div className="alert-detail-item">
                <div className="alert-detail-label">{strings.condition}</div>
                <div className="alert-detail-value">
                  {alert.condition === 'above' ? '↗' : '↘'} {strings[alert.condition]}
                </div>
              </div>

              {/* Target Price */}
              <div className="alert-detail-item">
                <div className="alert-detail-label">{strings.targetPrice}</div>
                <div className="alert-detail-value" style={{ color: 'var(--agri-primary)' }}>
                  ₹{alert.targetPrice}/kg
                </div>
              </div>

              {/* Triggered Info (if triggered) */}
              {isTriggered && (
                <>
                  <div className="alert-detail-item">
                    <div className="alert-detail-label">{strings.triggeredAt}</div>
                    <div className="alert-detail-value" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {new Date(alert.triggeredAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short'
                      })}
                    </div>
                  </div>

                  <div className="alert-detail-item">
                    <div className="alert-detail-label">{strings.actualPrice}</div>
                    <div className="alert-detail-value" style={{ color: 'var(--agri-growth)' }}>
                      ₹{alert.triggeredPrice}/kg
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer: Created Date */}
            <div className="alert-item-footer">
              <span>{strings.created}: {new Date(alert.createdAt).toLocaleDateString()}</span>
              {isTriggered && <span style={{ color: 'var(--agri-growth)', fontWeight: 'bold' }}>Success</span>}
            </div>
          </div>
        );
      })}

      {/* Pulse animation for active badges */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}
      </style>
    </div>
  );
};

export default AlertsList;