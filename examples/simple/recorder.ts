import { Server } from "ws";
import { Recorder } from "../../src";

const recorder = new Recorder({});

process.on("SIGINT", () => {
  recorder.stopAllRecords();
  process.exit();
});

const server = new Server({ port: 8888 });
console.log("start");

server.on("connection", async (socket) => {
  Promise.all(
    [
      recorder.addTransceiver("video", "recvonly"),
      recorder.addTransceiver("audio", "recvonly"),
    ].map((transceiver) => transceiver.onTrack.asPromise())
  ).then(([videoTrack, audioTrack]) => {
    recorder.recordAV(audioTrack, videoTrack, "./video.webm");
  });

  const offer = recorder.createOffer();
  await recorder.setLocalDescription(offer);
  const sdp = JSON.stringify(recorder.localDescription);
  socket.send(sdp);

  socket.on("message", (data: any) => {
    recorder.setRemoteDescription(JSON.parse(data));
  });
});
