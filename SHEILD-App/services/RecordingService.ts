class RecordingServiceImpl {
  private activeSessionId: string | null = null;

  startSession(sessionId: string) {
    if (this.activeSessionId) {
      return false;
    }

    this.activeSessionId = sessionId;
    return true;
  }

  endSession(sessionId?: string) {
    if (!this.activeSessionId) {
      return;
    }

    if (!sessionId || this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
  }

  isActive() {
    return this.activeSessionId !== null;
  }

  getActiveSessionId() {
    return this.activeSessionId;
  }
}

export const RecordingService = new RecordingServiceImpl();
