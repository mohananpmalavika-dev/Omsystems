/** Correct recorder channel without silently reducing helmet source detail. */
export function analyticsSourceUri(uri: string, channel?: number, preferMain = false): string {
  if (channel !== undefined && Number.isInteger(channel) && channel > 0) {
    uri = uri.replace(/([?&]channel=)\d+/i, `$1${channel}`)
      .replace(/\/Streaming\/Channels\/\d+(\d{2})/i, `/Streaming/Channels/${channel}$1`)
      .replace(/\/ch\d+\//i, `/ch${channel}/`);
  }
  if (preferMain) {
    uri = uri.replace(/([?&]subtype=)1(?=&|$)/i, "$10")
      .replace(/(\/Streaming\/Channels\/\d+)02(?=[/?]|$)/i, "$101")
      .replace(/(\/ch\d+\/)sub(\/av_stream)/i, "$1main$2");
  }
  return uri;
}
