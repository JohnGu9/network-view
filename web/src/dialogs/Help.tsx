import { Dialog, Button } from "rmcw";

function Help({ open, close }: { open: boolean, close: () => unknown }) {
  return (
    <Dialog open={open}
      onScrimClick={close}
      onEscapeKey={close}
      fullscreen
      title="Help"
      actions={<Button onClick={close}>close</Button>}>
      Sorry. Nothing can help.
    </Dialog>
  );
}

export default Help;
