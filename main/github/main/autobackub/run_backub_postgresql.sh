#!/bin/sh

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
DIR="backub/linux/postgreSQL/$TIMESTAMP"

# Список директорий для бэкапа
backup_dirs="
/media/localhost/backub-4/$DIR
/media/localhost/HDD/$DIR
/home/localhost/main/backub/$DIR 
/home/localhost/main/telegram/hub/db/postgresql/backub
/home/localhost/main/telegram/game/db/postgresql/backub
/media/localhost/dddd/$USER/$DIR
"
repo_dir="/home/localhost/main/github/main/cluster-postgresql"
error_occurred=0

# Создаем бэкап в указанных директориях
echo "$backup_dirs" | while read -r backup_dir; do
    [ -z "$backup_dir" ] && continue  # Пропускаем пустые строки
    
    # Создаем директорию
    if ! mkdir -p "$backup_dir" 2>/dev/null; then
        echo "ОШИБКА: Не удалось создать директорию $backup_dir (проверьте права)" >&2
        error_occurred=1
        continue
    fi
    
    # Создаем файл бэкапа
    backup_file="${backup_dir}/postgresql.sql"
    if ! sudo -u postgres pg_dumpall > "$backup_file" 2>/dev/null; then
        echo "ОШИБКА: Не удалось создать бэкап PostgreSQL в $backup_dir" >&2
        error_occurred=1
        continue
    fi
    
    # Проверяем размер и выводим информацию
    file_size=$(du -h "$backup_file" | awk '{print $1}')
    echo "Бэкап успешно создан: $backup_file"
    echo "Размер файла: $file_size"
done

# Отдельная обработка git-репозитория
if cd "$repo_dir" 2>/dev/null; then
    # Создаем бэкап в репозитории
    mkdir -p "$repo_dir"
    if sudo -u postgres pg_dumpall > "${repo_dir}/postgresql.sql" 2>/dev/null; then
        # Добавляем и коммитим изменения
        git add .
        if git commit -m "Update PostgreSQL backup $TIMESTAMP" >/dev/null 2>&1; then
            # Принудительный пуш (если требуется)
            git push --force
        else
            echo "Предупреждение: Нет изменений для коммита в репозитории" >&2
        fi
    else
        echo "ОШИБКА: Не удалось создать бэкап в репозитории" >&2
        error_occurred=1
    fi
else
    echo "ОШИБКА: Не удалось перейти в репозиторий $repo_dir" >&2
    error_occurred=1
fi

# Возвращаем статус ошибки
exit $error_occurred