import React, { useState, useEffect } from "react";
import { Typography } from "@mui/material";

interface FirstResponseIndicatorProps {
  startTime: number;
}

const messages = [
  { text: "This may take a while, please be patient.", delay: 0 },
  { text: "Still working on it, I promise!", delay: 60000 }, // 1 minute
  { text: "Wow, this is a tough one! Hang in there!", delay: 180000 }, // 3 minutes
  { text: "Hmm, this is taking longer than expected. Try again later?", delay: 300000 }, // 5 minutes
];

export const FirstResponseIndicator: React.FC<FirstResponseIndicatorProps> = ({ startTime }) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const checkTime = () => {
      const elapsed = Date.now() - startTime;
      
      // Find the appropriate message based on elapsed time
      for (let i = messages.length - 1; i >= 0; i--) {
        if (elapsed >= messages[i].delay) {
          setCurrentMessageIndex(i);
          break;
        }
      }
    };

    // Check immediately
    checkTime();

    // Set up interval to check every 10 seconds
    const interval = setInterval(checkTime, 10000);

    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <Typography
      variant="body2"
      sx={{
        color: "text.secondary",
        fontSize: "0.75rem", // Same as attachment indicator
        mt: "-1.5em",
        opacity: 0.7,
        textAlign: "left",
      }}
    >
      {messages[currentMessageIndex].text}
    </Typography>
  );
};
