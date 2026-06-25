# openSIS Classic — PHP 8.2 + Apache
# Build:  podman build -t opensis-web -f Containerfile .
FROM docker.io/library/php:8.2-apache

# System libraries needed to build the PHP extensions openSIS (and its
# bundled PhpSpreadsheet) rely on: gd, zip, intl, mbstring, mysqli.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpng-dev \
        libjpeg62-turbo-dev \
        libfreetype6-dev \
        libzip-dev \
        libicu-dev \
        libonig-dev \
        unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" mysqli gd zip intl mbstring \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

# Runtime tuning: the web installer loads large SQL files and imports can be
# slow on first run, so give PHP more time/memory and allow bigger uploads.
RUN { \
        echo 'memory_limit = 512M'; \
        echo 'upload_max_filesize = 64M'; \
        echo 'post_max_size = 64M'; \
        echo 'max_execution_time = 600'; \
        echo 'max_input_vars = 10000'; \
        echo 'date.timezone = UTC'; \
        echo 'display_errors = Off'; \
    } > /usr/local/etc/php/conf.d/opensis.ini

# openSIS ships a .htaccess; allow it to take effect.
RUN sed -ri 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

WORKDIR /var/www/html
EXPOSE 80
