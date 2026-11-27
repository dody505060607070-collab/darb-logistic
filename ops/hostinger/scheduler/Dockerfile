FROM alpine:3.22
RUN apk add --no-cache curl
COPY crontab /etc/crontabs/root
COPY run-job.sh /usr/local/bin/run-job
RUN chmod 0755 /usr/local/bin/run-job
ENV TZ=UTC
CMD ["crond", "-f", "-l", "2"]
