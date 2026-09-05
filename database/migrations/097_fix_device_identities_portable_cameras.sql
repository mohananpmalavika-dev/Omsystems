-- 097_fix_device_identities_portable_cameras.sql
-- Allow portable and software camera source types in device_identities table

ALTER TABLE device_identities DROP CONSTRAINT IF EXISTS device_identities_device_type_check;
ALTER TABLE device_identities ADD CONSTRAINT device_identities_device_type_check
  CHECK (device_type IN (
    'ip-camera', 'analog-dvr-channel', 'nvr-channel',
    'laptop-camera', 'usb-webcam', 'usb-capture-card',
    'android-camera', 'ios-camera', 'browser-camera'
  ));
