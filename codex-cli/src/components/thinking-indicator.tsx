import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

interface ThinkingIndicatorProps {
  isThinking: boolean;
  thinkingSeconds: number;
  agentInfo?: {
    model?: string;
    task?: string;
  };
  queueInfo?: {
    size: number;
    isProcessing: boolean;
  };
}

export function ThinkingIndicator({ 
  isThinking, 
  thinkingSeconds, 
  agentInfo, 
  queueInfo 
}: ThinkingIndicatorProps): React.ReactElement | null {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    if (!isThinking) return;

    const interval = setInterval(() => {
      setDotCount(prev => (prev + 1) % 4);
    }, 500);

    return () => clearInterval(interval);
  }, [isThinking]);

  if (!isThinking && (!queueInfo || queueInfo.size === 0)) {
    return null;
  }

  const dots = '.'.repeat(dotCount);
  const spaces = ' '.repeat(3 - dotCount);

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={0}>
      {/* Thinking Status - Non-blocking */}
      {isThinking && (
        <Box paddingX={1}>
          <Text color="yellow">⚡ </Text>
          <Text color="cyan">
            {agentInfo?.model ? `[${agentInfo.model}] ` : ''}
            Thinking{dots}{spaces}
          </Text>
          {thinkingSeconds > 0 && (
            <Text color="gray"> ({thinkingSeconds}s)</Text>
          )}
          {agentInfo?.task && (
            <Text color="gray"> - {agentInfo.task}</Text>
          )}
        </Box>
      )}

      {/* Queue Status - Always visible when there's a queue */}
      {queueInfo && queueInfo.size > 0 && (
        <Box paddingX={1}>
          <Text color="blue">📋 </Text>
          <Text color="cyan">
            {queueInfo.size} input{queueInfo.size === 1 ? '' : 's'} queued
          </Text>
          {queueInfo.isProcessing && (
            <Text color="yellow"> (processing...)</Text>
          )}
          <Text color="gray"> - You can continue typing!</Text>
        </Box>
      )}
    </Box>
  );
}