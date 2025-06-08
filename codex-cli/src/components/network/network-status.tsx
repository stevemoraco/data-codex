import React from "react";
import { Box, Text } from "ink";

interface NetworkStatusProps {
  networkStatus: string;
  compact?: boolean;
}

export function NetworkStatus({ networkStatus, compact = true }: NetworkStatusProps): React.ReactElement {
  if (compact) {
    return (
      <Box paddingX={1} marginBottom={1}>
        <Text color="blue">NETWORK: </Text>
        <Text>{networkStatus}</Text>
        <Text color="gray"> | Use /network to toggle, /swarm for swarm mode</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor="blue" marginBottom={1}>
      <Box paddingX={2} paddingY={1}>
        <Text bold color="blueBright">🌐 Network Status</Text>
        <Box marginTop={1}>
          <Text>{networkStatus}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Use /network command to toggle network access</Text>
        </Box>
      </Box>
    </Box>
  );
}