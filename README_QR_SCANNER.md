# QR Camera Onboarding

The Branch Onboarding credential prompt can scan a QR code with the browser camera or decode an uploaded QR image. QR decoding stays in the browser; decoded QR contents are not logged or stored.

## Supported QR data

- Camera credentials in JSON, key-value, URL query, or comma-separated formats. The dashboard fills the local device username and password before the operator verifies the camera through the Branch Gateway.
- TrueCloud device-sharing QR codes (`openapi.dvr163.com/share/device`). The dashboard recognizes these codes and indicates whether their expiry time has passed, but never stores or displays their token.

## TrueCloud limitation

A TrueCloud sharing QR code is an account-to-account share link. It does not expose an ONVIF endpoint, RTSP URL, camera password, or usable video stream. Claim the QR code in the authenticated TrueCloud application first. To monitor that camera in Sentinel Grid, enable its local ONVIF or RTSP service and provide the private IP address and device credentials through the normal onboarding flow.

A direct TrueCloud cloud integration requires vendor-issued API credentials and documented stream-access APIs; it cannot be established from a share QR code alone.
