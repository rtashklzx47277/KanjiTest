#!/bin/bash

DATE=$(date +\%Y\%m\%d)
BACKUP_FILE="/backup/${DATE}.sql"

docker exec pg-db PGPASSWORD=test pg_dump -U test pgdb > ${BACKUP_FILE}

# crontab -e
# 0 21 * * * /backup.sh
