FROM emscripten/emsdk:5.0.6

RUN apt-get update && apt-get install -y --no-install-recommends \
    tcl \
    wabt \
    zip \
    curl \
    unzip \
    openssl \
    && rm -rf /var/lib/apt/lists/*

USER ubuntu
WORKDIR /home/ubuntu/build

ARG SQLITE_NAME=sqlite-src-3530000
ARG SQLITE_URL=https://www.sqlite.org/2026/${SQLITE_NAME}.zip
ARG SQLITE_SHA3=4ffbd00ba8db1e1172dbc69a5203a2c185556a32543e58585ba3713abf676fe5

RUN curl -L -o sqlite-src.zip ${SQLITE_URL} && \
    actual=$(openssl dgst -sha3-256 sqlite-src.zip | awk '{print $2}') && \
    if [ "$actual" != "${SQLITE_SHA3}" ]; then \
        echo "SHA3 verification failed: $actual"; \
        rm sqlite-src.zip; \
        exit 1; \
    fi && \
    unzip -o sqlite-src.zip && \
    mv ${SQLITE_NAME} sqlite-src

RUN cd sqlite-src && ./configure && make sqlite3.c

COPY sqlite3_wasm_extra_init.c sqlite-src/ext/wasm/sqlite3_wasm_extra_init.c

RUN make -C sqlite-src/ext/wasm npm

FROM scratch
COPY --from=0 /home/ubuntu/build/sqlite-src/ext/wasm/jswasm/ /
