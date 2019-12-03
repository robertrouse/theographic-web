import { createMuiTheme, colors } from "@material-ui/core";

const theme = createMuiTheme({
  palette: {
    primary: {
      main: `#556cd6`,
    },
    secondary: {
      main: `#19857b`,
    },
    text: {
      main: `#rgba(0, 0, 0, 0.87)`,
      secondary: `rgba(0, 0, 0, 0.54)`
    },
    error: {
      main: colors.red.A400,
    },
    background: {
      default: `#fff`,
    },
  },
  typography: {
    fontFamily: "'Arial', sans-serif",
  },
  spacing: 8,
});

export default theme;