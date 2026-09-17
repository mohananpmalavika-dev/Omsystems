/**
 * Mobile Detection Hook
 * 
 * Detects device type and provides responsive utilities
 */

import { useEffect, useState } from 'react';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
}

export function useMobileDetect() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    screenWidth: typeof window !== 'undefined' ? window.innerWidth : 1920,
    screenHeight: typeof window !== 'undefined' ? window.innerHeight : 1080,
    orientation: 'landscape',
  });
  
  useEffect(() => {
    const updateDeviceInfo = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setDeviceInfo({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        screenWidth: width,
        screenHeight: height,
        orientation: width > height ? 'landscape' : 'portrait',
      });
    };
    
    updateDeviceInfo();
    
    window.addEventListener('resize', updateDeviceInfo);
    window.addEventListener('orientationchange', updateDeviceInfo);
    
    return () => {
      window.removeEventListener('resize', updateDeviceInfo);
      window.removeEventListener('orientationchange', updateDeviceInfo);
    };
  }, []);
  
  return deviceInfo;
}

/**
 * Get responsive chart height based on device
 */
export function useResponsiveChartHeight(
  desktopHeight: number = 300,
  tabletHeight: number = 250,
  mobileHeight: number = 200
): number {
  const { isMobile, isTablet } = useMobileDetect();
  
  if (isMobile) return mobileHeight;
  if (isTablet) return tabletHeight;
  return desktopHeight;
}
