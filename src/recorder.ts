import { ChildProcess, exec } from "child_process";
import { createSocket } from "dgram";
import { RTCPeerConnection, PeerConfig } from "werift";
import * as uuid from "uuid";
import { RtpTrack } from "werift/lib/rtc/media/track";

const udp = createSocket("udp4");

export class Recorder extends RTCPeerConnection {
  recordProcesses: { [id: string]: ChildProcess } = {};

  constructor(config: Partial<PeerConfig> = {}) {
    super(config);
  }

  stopRecord(id: string) {
    const proc = this.recordProcesses[id];
    if (!proc) throw new Error();

    proc.kill("SIGINT");
    delete this.recordProcesses[id];
  }

  stopAllRecords() {
    Object.values(this.recordProcesses).forEach((proc) => proc.kill("SIGINT"));
    this.recordProcesses = {};
  }

  recordAV(audioTrack: RtpTrack, videoTrack: RtpTrack, path: string) {
    const id = uuid.v4();

    this.recordProcesses[id] = exec(`gst-launch-1.0 -e \
	udpsrc name=videoRTP port=4002 \
	caps = "application/x-rtp, media=(string)video, clock-rate=(int)90000, encoding-name=(string)VP8, payload=(int)97" \
	! queue \
	! rtpvp8depay ! vp8dec ! videoconvert ! x264enc \
	! queue ! muxer.video_0 \
	udpsrc port=4003 \
	caps = "application/x-rtp, media=(string)audio, clock-rate=(int)48000, encoding-name=(string)OPUS, payload=(int)96" \
	! queue \
	! rtpopusdepay ! opusparse \
	! queue ! muxer.audio_0 \
	qtmux name="muxer" ! filesink location=${path}`);

    videoTrack.onRtp.subscribe((rtp) => {
      udp.send(rtp.serialize(), 4002, "127.0.0.1");
    });

    audioTrack.onRtp.subscribe((rtp) => {
      udp.send(rtp.serialize(), 4003, "127.0.0.1");
    });

    return id;
  }
}
