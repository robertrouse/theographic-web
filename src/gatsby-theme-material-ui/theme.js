import { createMuiTheme, colors } from "@material-ui/core";

const theme = createMuiTheme({
  palette: {
    primary: {
      main: `#556cd6`,
    },
    secondary: {
      main: `#19857b`,
    },
    error: {
      main: colors.red.A400,
    },
    background: {
      default: `#fff`,
    },
  },
  spacing: 8,
});

export default theme;