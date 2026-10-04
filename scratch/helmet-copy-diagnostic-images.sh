set -e
for channel in 2 6 8; do sudo docker cp sentinel-gcp-analytics-engine:/tmp/helmet-alert-ch${channel}.jpg /tmp/helmet-alert-ch${channel}.jpg; done
tar czf /tmp/helmet-live-images.tar.gz -C /tmp helmet-alert-ch2.jpg helmet-alert-ch6.jpg helmet-alert-ch8.jpg
