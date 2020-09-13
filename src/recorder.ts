import { ChildProcess, exec } from "child_process";
import { createSocket } from "dgram";
import * as uuid from "uuid";
import { PeerConfig, RTCPeerConnection } from "werift";
import { RtpTrack } from "werift/lib/rtc/media/track";

const udp = createSocket("udp4");

export class Recorder extends RTCPeerConnection {
  records: {
    [id: string]: {
      proc: ChildProcess;
      listens: { unSubscribe: () => void }[];
    };
  } = {};

  constructor(config: Partial<PeerConfig> = {}) {
    super(config);
  }

  stopRecord = (id: string) => {
    const record = this.records[id];
    if (!record) throw new Error();

    record.listens.forEach((v) => v.unSubscribe());
    record.proc.kill("SIGINT");

    delete this.records[id];
  };

  stopAllRecords = () => {
    Object.keys(this.records).forEach(this.stopRecord);
  };

  recordAV(audioTrack: RtpTrack, videoTrack: RtpTrack, path: string) {
    const id = uuid.v4();

    const proc = exec(`gst-launch-1.0 -e \
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

    proc.stdout.on("data", (data) => console.log(data.toString()));

    const listens = [
      videoTrack.onRtp.subscribe((rtp) => {
        udp.send(rtp.serialize(), 4002, "127.0.0.1");
      }),
      audioTrack.onRtp.subscribe((rtp) => {
        udp.send(rtp.serialize(), 4003, "127.0.0.1");
      }),
    ];

    this.records[id] = { proc, listens };

    return id;
  }
}
