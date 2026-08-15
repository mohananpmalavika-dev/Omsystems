export const CPPLUS_DAHUA_COMPATIBLE_FIXTURE = {
  systemInfo: `deviceType=CP-UNR-4K4322-V2
serialNumber=CP2026081600124
softwareVersion=4.001.0000000.1.R.20260415
hardwareVersion=1.00
processor=Hi3536`,
  channelConfig: `table.ChannelTitle[0].Name=Main Entrance CAM01
table.ChannelTitle[1].Name=Cash Counter CAM02
table.ChannelTitle[2].Name=Vault Room CAM03
table.ChannelTitle[3].Name=Parking Area CAM04`,
  storageInfo: `table.Drive[0].Name=SATA1
table.Drive[0].Capacity=4000787030016
table.Drive[0].Health=Normal
table.Drive[0].SmartStatus=Passed
table.Drive[0].Temperature=38
table.Drive[1].Name=SATA2
table.Drive[1].Capacity=4000787030016
table.Drive[1].Health=Normal
table.Drive[1].SmartStatus=Passed
table.Drive[1].Temperature=41`,
  onvifDeviceInfo: {
    manufacturer: "CP PLUS",
    model: "CP-UNR-4K4322-V2",
    firmwareVersion: "4.001.0000000.1.R",
    serialNumber: "CP2026081600124",
  },
};

export const CPPLUS_ONVIF_ONLY_FIXTURE = {
  onvifDeviceInfo: {
    manufacturer: "CP PLUS",
    model: "CP-ONVIF-HYBRID-08",
    firmwareVersion: "2.100.000",
    serialNumber: "CPONVIF88371",
  },
  profiles: [
    { token: "Profile_1", name: "Main_Stream_CH1", codec: "H264" as const, width: 1920, height: 1080 },
    { token: "Profile_2", name: "Sub_Stream_CH1", codec: "H264" as const, width: 704, height: 576 },
    { token: "Profile_3", name: "Main_Stream_CH2", codec: "H264" as const, width: 1920, height: 1080 },
  ],
};

export const CPPLUS_ISAPI_COMPATIBLE_FIXTURE = {
  deviceInfoXml: `<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <deviceName>CP-PLUS-OEM-NVR</deviceName>
  <deviceID>88</deviceID>
  <model>CP-UVR-0801E1</model>
  <serialNumber>CPISAPI99201</serialNumber>
  <firmwareVersion>V3.4.80</firmwareVersion>
  <manufacturer>CP PLUS</manufacturer>
</DeviceInfo>`,
  storageXml: `<?xml version="1.0" encoding="UTF-8"?>
<Storage version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <hddList>
    <hdd>
      <id>1</id>
      <hddName>SATA 1</hddName>
      <capacity>2000398934016</capacity>
      <status>OK</status>
    </hdd>
  </hddList>
</Storage>`,
};

export const UNKNOWN_RECORDER_FIXTURE = {
  htmlLogin: `<!DOCTYPE html>
<html>
  <head><title>Web Video Surveillance Login</title></head>
  <body><form action="/login"><input name="username"/><input name="password"/></form></body>
</html>`,
};
