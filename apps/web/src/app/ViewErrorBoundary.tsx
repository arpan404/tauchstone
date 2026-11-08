import { Component, type ReactNode } from "react";
import { WarningIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/system";
import { Button } from "@/components/ui/button";

/** A crash in one view shows a recoverable panel instead of blanking the whole app. */
export class ViewErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { error: Error | null; key: string }
> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error) {
    console.error("View crashed", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mvp-view">
        <EmptyState
          icon={<WarningIcon />}
          title="This view hit an error"
          action={<Button variant="outline" onClick={() => this.setState({ error: null })}>Reload view</Button>}
        />
      </div>
    );
  }
}
