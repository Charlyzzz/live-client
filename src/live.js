const { LivePromiseClient } = require('./pubsub_grpc_web_pb');
const { SubRequest, EventRequest } = require('./pubsub_pb.js');

export const radio = (host, port) => {
  const liveService = new LivePromiseClient(`http://${host}:${port}`);
  const subscribe = (topic) => {
    const request = new SubRequest();
    request.setName(topic);
    return liveService.subscribe(request);
  };
  return {
    tuneIn(topic, onError) {
      const warnTooManyReconnections = (e) => {
        console.error('Tried reconnecting too many times');
        console.error(e);
      };

      const maxRetries = 3;
      const backoff = 2000;
      const jitter = (time) => Math.floor(Math.random() * 1000) * time;
      const newSubscription = {
        callbacks: {},
        stream: subscribe(topic),
        retryCount: 0,
        streamErrored(error) {
          console.error('stream failed');
          console.error(error);
          this.retryCount += 1;
          if (this.retryCount <= maxRetries) {
            setTimeout(() => this.setupStream(), backoff + jitter(this.retryCount));
          } else {
            this.cleanupStream();
            (onError || warnTooManyReconnections)(new Error('Failed too many times!'));
          }
        },
        setupStream() {
          if (this.stream) {
            this.cleanupStream();
          }
          this.stream = subscribe(topic);
          console.log('stream connected!');
          this.stream.on('data', (data) => this.emit(data));
          this.stream.on('status', console.log);
          this.stream.on('error', (err) => this.streamErrored(err));
          this.stream.on('end', () => this.cleanupStream());
        },
        cleanupStream() {
          this.stream.cancel();
          this.stream = null;
        },
        emit(data) {
          this.streamSucceeded();
          this.getCallback()(data.getMessage());
        },
        streamSucceeded() {
          this.retryCount = 0;
        },
        onMessage(callback) {
          if (typeof callback != 'function')
            throw new Error('callback is not a function ');
          this.callback = callback;
        },
        getCallback() {
          return this.callback;
        },
        setCallback(callback) {
          this.callback = callback;
        }
      };
      newSubscription.setupStream();
      return newSubscription;
    },
    yell(topic, msg) {
      let eventRequest = new EventRequest();
      eventRequest.setTopic(topic);
      eventRequest.setEvent(msg);
      liveService.emitEvent(eventRequest).then(console.log).catch(console.error);
    }
  };
};

