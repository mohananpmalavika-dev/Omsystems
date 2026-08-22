-- ============================================================================
-- PREDICTION NOTIFICATIONS
-- ============================================================================
-- Tracking table for prediction alert notifications

CREATE TABLE IF NOT EXISTS prediction_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES failure_predictions(id) ON DELETE CASCADE,
  
  sent_at timestamptz NOT NULL,
  channels jsonb NOT NULL, -- {inApp: bool, email: bool, sms: bool, webhook: bool}
  
  -- Recipients
  recipients jsonb, -- [{ userId, email, phone }]
  
  -- Acknowledgment
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id),
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prediction_notifications_prediction_idx 
  ON prediction_notifications (prediction_id, sent_at DESC);
CREATE INDEX prediction_notifications_sent_idx 
  ON prediction_notifications (sent_at DESC);

COMMENT ON TABLE prediction_notifications IS 'Tracks when prediction alerts were sent to users';
