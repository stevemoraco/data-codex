import type { MobileSession } from "../../mobile/mobile-bridge.js";

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

interface MobileQRDisplayProps {
  session: MobileSession | null;
  onGenerateQR: () => Promise<{ qrCode: string; sessionId: string }>;
}

export function MobileQRDisplay({ session, onGenerateQR }: MobileQRDisplayProps): React.ReactElement {
  const [qrSession, setQRSession] = useState<MobileSession | null>(session);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    setQRSession(session);
  }, [session]);

  const handleGenerateQR = async () => {
    try {
      const { qrCode, sessionId } = await onGenerateQR();
      setQRSession({
        sessionId,
        qrCode,
        authenticated: false,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        preferences: {
          notifyOnCompletion: true,
          notifyOnError: true,
          notifyOnSwarmStart: true,
          voiceFeedback: false
        }
      });
      setShowQR(true);
    } catch (error) {
      // Handle error silently
    }
  };

  if (qrSession?.authenticated) {
    return <></>; // Mobile status now handled in main dashboard
  }

  if (showQR && qrSession && !qrSession.authenticated) {
    return (
      <Box paddingX={1}>
        <Text color="yellow">📱 QR: </Text>
        <Text color="gray">Scan with mobile app | Expires 5min</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text color="gray">📱 MOBILE: </Text>
      <Text color="cyan" onPress={handleGenerateQR}>Generate QR (q)</Text>
    </Box>
  );
}

function generateQRDisplay(qrCode: string): string {
  // Simplified QR code visualization for terminal
  // In a real implementation, this would use a proper QR code library
  const size = 15;
  const pattern = [];
  
  // Generate a simple pattern based on the QR code hash
  let hash = 0;
  for (let i = 0; i < qrCode.length; i++) {
    hash = ((hash << 5) - hash + qrCode.charCodeAt(i)) & 0xffffffff;
  }
  
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      const cellHash = (hash + y * size + x) & 0xffffffff;
      row += (cellHash % 3 === 0) ? '██' : '  ';
    }
    pattern.push(row);
  }
  
  return pattern.join('\\n');
}