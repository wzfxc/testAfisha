'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SeatsErrorBoundaryProps {
  children: ReactNode;
}

interface SeatsErrorBoundaryState {
  hasError: boolean;
}

export class SeatsErrorBoundary extends Component<
  SeatsErrorBoundaryProps,
  SeatsErrorBoundaryState
> {
  constructor(props: SeatsErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SeatsErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[SeatsErrorBoundary]', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm"
        >
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            Блок вільних місць тимчасово недоступний
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Сервіс тимчасово недоступний
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false })}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Спробувати ще</span>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
