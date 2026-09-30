import { Alert, Box, Slide, Snackbar } from "@mui/material";
import { useEffect, useState } from "react";
import { usePlayer } from "../player/store";

/** Surfaces transient player notices (unplayable track, add-to-queue, …). */
export function Notice() {
  const notice = usePlayer((state) => state.notice);
  const dismiss = usePlayer((state) => state.dismissNotice);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setOpen(true);
    const timer = window.setTimeout(
      () => setOpen(false),
      notice.tone === "error" ? 5200 : 2400,
    );
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <Snackbar
      open={open}
      autoHideDuration={null}
      onClose={dismiss}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      slots={{ transition: (props) => <Slide {...props} direction="up" /> }}
      sx={{ mb: { xs: 1, md: 12 } }}
    >
      <Box>
        <Alert
          severity={
            notice?.tone === "error"
              ? "error"
              : notice?.tone === "success"
                ? "success"
                : "info"
          }
          variant="outlined"
          onClose={dismiss}
          sx={{
            borderRadius: "999px",
            px: 2.5,
            backdropFilter: "blur(18px)",
            backgroundColor: "rgba(24,24,31,0.92)",
            borderColor: "rgba(255,255,255,0.10)",
            "& .MuiAlert-icon": { mr: 1 },
          }}
        >
          {notice?.text}
        </Alert>
      </Box>
    </Snackbar>
  );
}
