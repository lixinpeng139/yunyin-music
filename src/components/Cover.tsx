import { Box, Skeleton, type SxProps, type Theme } from "@mui/material";
import { useEffect, useState } from "react";
import { img } from "../api/normalize";
import { radius } from "../theme";

interface CoverProps {
  src?: string;
  /** Requested pixel size of the source image. */
  size?: number;
  /** CSS size of the rendered box. */
  width?: number | string;
  height?: number | string;
  radiusSize?: number;
  /** Material 3 style "squircle": a subtly asymmetric corner. */
  squircle?: boolean;
  sx?: SxProps<Theme>;
  alt?: string;
  className?: string;
}

/**
 * Album / playlist artwork with a graceful placeholder.
 *
 * The NetEase CDN occasionally refuses a resized variant, so a failed load is
 * retried once against the untouched URL before the placeholder is shown.
 */
export function Cover({
  src,
  size = 300,
  width = 44,
  height = width,
  radiusSize = radius.sm,
  squircle = false,
  sx,
  alt = "",
  className,
}: CoverProps) {
  const resized = img(src, size);
  const [candidate, setCandidate] = useState(resized);
  const [failed, setFailed] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    setCandidate(resized);
    setFailed(false);
    setUsedFallback(false);
  }, [resized]);

  const showImage = Boolean(candidate) && !failed;

  return (
    <Box
      className={className}
      sx={[
        {
          width,
          height,
          flex: "0 0 auto",
          borderRadius: `${radiusSize}px`,
          overflow: "hidden",
          position: "relative",
          backgroundColor: "rgba(255,255,255,0.06)",
          backgroundImage:
            "linear-gradient(135deg, rgba(255,255,255,.07), rgba(255,255,255,.02))",
          ...(squircle
            ? {
                borderRadius: `${radiusSize}px ${Math.round(radiusSize * 1.7)}px`,
              }
            : null),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {showImage ? (
        <Box
          component="img"
          src={candidate}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => {
            if (!usedFallback && src && resized !== src) {
              setUsedFallback(true);
              setCandidate(src);
              return;
            }
            setFailed(true);
          }}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,.28)",
            fontSize:
              typeof width === "number" ? Math.max(10, width * 0.3) : 14,
            fontWeight: 700,
          }}
        >
          ♪
        </Box>
      )}
    </Box>
  );
}

export function CoverSkeleton({
  width = 44,
  radiusSize = radius.sm,
}: {
  width?: number;
  radiusSize?: number;
}) {
  return (
    <Skeleton
      variant="rounded"
      width={width}
      height={width}
      sx={{ borderRadius: `${radiusSize}px` }}
    />
  );
}
