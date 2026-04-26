#include "sqlite3.h"
#include <string.h>

// --------------------------------------------------
// TOKENIZER

#define MCSRC_TOK_BUF 512

typedef struct McsrcTokenizer {
    int iVersion;
} McsrcTokenizer;

static int mcsrc_lower(unsigned char c) {
    return (c >= 'A' && c <= 'Z') ? c + 32 : c;
}

static int mcsrc_is_ident_start(unsigned char c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c > 127;
}

static int mcsrc_is_ident_cont(unsigned char c) {
    return mcsrc_is_ident_start(c) || (c >= '0' && c <= '9');
}

/*
** Emit a Java identifier as:
**   1. full token lowercased (position N)
**   2. camelCase/underscore parts lowercased, colocated at position N
**
** Examples:
**   getUserName  -> "getusername", "get", "user", "name"
**   parseXMLDoc  -> "parsexmldoc", "parse", "xml", "doc"
**   MAX_VALUE    -> "max_value", "max", "value"
**   HTML5Parser  -> "html5parser", "html5", "parser"
*/
static int mcsrc_emit_ident(const char *pText, int iStart, int iEnd,
                             void *pCtx,
                             int (*xToken)(void*, int, const char*, int, int, int))
{
    char aBuf[MCSRC_TOK_BUF];
    const char *p = pText + iStart;
    int n = iEnd - iStart;
    int i, segStart, segEnd, rc;

    /* Emit full identifier lowercased */
    int nFull = n < MCSRC_TOK_BUF ? n : MCSRC_TOK_BUF - 1;
    for (i = 0; i < nFull; i++) aBuf[i] = (char)mcsrc_lower((unsigned char)p[i]);
    rc = xToken(pCtx, 0, aBuf, nFull, iStart, iEnd);
    if (rc != SQLITE_OK) return rc;

    /* Emit split parts as colocated tokens */
    segStart = 0;
    while (segStart < nFull) {
        /* Skip leading underscores between segments */
        while (segStart < nFull && p[segStart] == '_') segStart++;
        if (segStart >= nFull) break;

        segEnd = segStart + 1;
        while (segEnd < nFull) {
            unsigned char cur  = (unsigned char)p[segEnd];
            unsigned char prev = (unsigned char)p[segEnd - 1];

            if (cur == '_') break;

            /* letter -> digit: split (item3d -> item|3d) */
            if ((cur >= '0' && cur <= '9') &&
                ((prev >= 'a' && prev <= 'z') || (prev >= 'A' && prev <= 'Z'))) break;

            if (cur >= 'A' && cur <= 'Z') {
                /* lower/digit -> upper: new word starts here */
                if ((prev >= 'a' && prev <= 'z') || (prev >= '0' && prev <= '9')) break;
                /* upper run -> upper+lower: split before last upper (XMLDoc -> XML|Doc) */
                if ((prev >= 'A' && prev <= 'Z') && segEnd + 1 < nFull) {
                    unsigned char next = (unsigned char)p[segEnd + 1];
                    if (next >= 'a' && next <= 'z') break;
                }
            }
            segEnd++;
        }

        int segLen = segEnd - segStart;
        if (segLen > 0 && segLen < nFull) {
            int tokLen = segLen < MCSRC_TOK_BUF ? segLen : MCSRC_TOK_BUF - 1;
            for (i = 0; i < tokLen; i++) {
                aBuf[i] = (char)mcsrc_lower((unsigned char)p[segStart + i]);
            }
            rc = xToken(pCtx, FTS5_TOKEN_COLOCATED, aBuf, tokLen, iStart, iEnd);
            if (rc != SQLITE_OK) return rc;
        }

        segStart = segEnd;
    }

    return SQLITE_OK;
}

int mcsrc_tokenizer_create(void *z, const char **argv, int argc, Fts5Tokenizer **out)
{
    McsrcTokenizer *p = (McsrcTokenizer*)sqlite3_malloc(sizeof(McsrcTokenizer));
    if (!p) return SQLITE_NOMEM;
    p->iVersion = 1;
    *out = (Fts5Tokenizer*)p;
    return SQLITE_OK;
}

void mcsrc_tokenizer_delete(Fts5Tokenizer *self) {
    sqlite3_free(self);
}

int mcsrc_tokenizer_tokenize(Fts5Tokenizer *self,
                             void *pCtx,
                             int flags,
                             const char *pText, int nText,
                             const char *pLocale, int nLocale,
                             int (*xToken)(void *pCtx,
                                           int tflags,
                                           const char *pToken,
                                           int nToken,
                                           int iStart,
                                           int iEnd))
{
    int i = 0;
    int rc = SQLITE_OK;

    while (i < nText && rc == SQLITE_OK) {
        unsigned char c = (unsigned char)pText[i];

        /* Whitespace */
        if (c <= ' ') { i++; continue; }

        /* Line comment: skip to end of line */
        if (c == '/' && i + 1 < nText && pText[i+1] == '/') {
            i += 2;
            while (i < nText && pText[i] != '\n') i++;
            continue;
        }

        /* Block / doc comment: tokenize words inside for Javadoc search */
        if (c == '/' && i + 1 < nText && pText[i+1] == '*') {
            i += 2;
            while (i + 1 < nText && !(pText[i] == '*' && pText[i+1] == '/')) {
                unsigned char cc = (unsigned char)pText[i];
                if (mcsrc_is_ident_start(cc)) {
                    int wStart = i;
                    while (i < nText &&
                           !(pText[i] == '*' && i + 1 < nText && pText[i+1] == '/') &&
                           mcsrc_is_ident_cont((unsigned char)pText[i])) i++;
                    rc = mcsrc_emit_ident(pText, wStart, i, pCtx, xToken);
                } else {
                    i++;
                }
            }
            if (i + 1 < nText) i += 2;
            continue;
        }

        /* String literal: tokenize identifier-like words inside */
        if (c == '"') {
            i++;
            while (i < nText && pText[i] != '"') {
                if (pText[i] == '\\') { i += 2; continue; }
                unsigned char sc = (unsigned char)pText[i];
                if (mcsrc_is_ident_start(sc)) {
                    int wStart = i;
                    while (i < nText && pText[i] != '"' && pText[i] != '\\' &&
                           mcsrc_is_ident_cont((unsigned char)pText[i])) i++;
                    rc = mcsrc_emit_ident(pText, wStart, i, pCtx, xToken);
                } else {
                    i++;
                }
            }
            if (i < nText) i++;
            continue;
        }

        /* Char literal: skip */
        if (c == '\'') {
            i++;
            while (i < nText && pText[i] != '\'') {
                if (pText[i] == '\\') { i += 2; continue; }
                i++;
            }
            if (i < nText) i++;
            continue;
        }

        /* Identifier (including keywords and annotations after @) */
        if (mcsrc_is_ident_start(c)) {
            int idStart = i;
            while (i < nText && mcsrc_is_ident_cont((unsigned char)pText[i])) i++;
            rc = mcsrc_emit_ident(pText, idStart, i, pCtx, xToken);
            continue;
        }

        /* Number literal (decimal, hex, float) */
        if (c >= '0' && c <= '9') {
            char aBuf[MCSRC_TOK_BUF];
            int numStart = i;
            unsigned char nc;

            if (c == '0' && i + 1 < nText && (pText[i+1] == 'x' || pText[i+1] == 'X')) {
                /* Hexadecimal */
                i += 2;
                while (i < nText) {
                    nc = (unsigned char)pText[i];
                    if ((nc >= '0' && nc <= '9') ||
                        (nc >= 'a' && nc <= 'f') ||
                        (nc >= 'A' && nc <= 'F') || nc == '_') i++;
                    else break;
                }
            } else {
                /* Decimal / float */
                while (i < nText) {
                    nc = (unsigned char)pText[i];
                    if ((nc >= '0' && nc <= '9') || nc == '_' || nc == '.') {
                        i++;
                    } else if (nc == 'e' || nc == 'E') {
                        i++;
                        if (i < nText && (pText[i] == '+' || pText[i] == '-')) i++;
                    } else break;
                }
            }
            /* Numeric suffix: L l F f D d */
            while (i < nText) {
                nc = (unsigned char)pText[i];
                if (nc=='L'||nc=='l'||nc=='F'||nc=='f'||nc=='D'||nc=='d') i++;
                else break;
            }

            int numLen = i - numStart;
            int tokLen = numLen < MCSRC_TOK_BUF ? numLen : MCSRC_TOK_BUF - 1;
            int j;
            for (j = 0; j < tokLen; j++) {
                aBuf[j] = (char)mcsrc_lower((unsigned char)pText[numStart + j]);
            }
            rc = xToken(pCtx, 0, aBuf, tokLen, numStart, i);
            continue;
        }

        /* Skip @ (annotation prefix), operators, punctuation */
        i++;
    }

    return (rc == SQLITE_DONE) ? SQLITE_OK : rc;
}

struct fts5_tokenizer_v2 mcsrc_tokenizer = {
    .iVersion = 2,
    .xCreate = mcsrc_tokenizer_create,
    .xDelete = mcsrc_tokenizer_delete,
    .xTokenize = mcsrc_tokenizer_tokenize
};

// --------------------------------------------------
// OFFSET FUNCTION

typedef struct {
    int iStart;
    int iEnd;
} TokenPos;

typedef struct {
    TokenPos *aPos;
    int nPos;
    int nAlloc;
    int bTokenized;
    const char *pText;  /* NOT owned; valid for duration of aux function call */
    int nText;
} ColTokens;

static int mcsrc_offsets_token_cb(void *pCtx, int tflags, const char *pToken,
                                   int nToken, int iStart, int iEnd) {
    ColTokens *p = (ColTokens*)pCtx;
    if (tflags & FTS5_TOKEN_COLOCATED) return SQLITE_OK;
    if (p->nPos >= p->nAlloc) {
        int nNew = p->nAlloc ? p->nAlloc * 2 : 64;
        TokenPos *aNew = (TokenPos*)sqlite3_realloc(p->aPos, nNew * sizeof(TokenPos));
        if (!aNew) return SQLITE_NOMEM;
        p->aPos = aNew;
        p->nAlloc = nNew;
    }
    p->aPos[p->nPos].iStart = iStart;
    p->aPos[p->nPos].iEnd = iEnd;
    p->nPos++;
    return SQLITE_OK;
}

/* Returns records of "col phrase byteoffset bytesize snippet_length\nsnippet"
** for each phrase match in the current row.
** Parameters (all optional):
**   pre      - string inserted before the matched token in the snippet (default "")
**   post     - string inserted after the matched token in the snippet (default "")
**   ellipsis - prefix/suffix when snippet does not reach the text boundary (default "...")
**   maxToken - total tokens in context window around the match (default 11)
*/
static void mcsrc_offsets(const Fts5ExtensionApi *pApi,
                          Fts5Context *pFts,
                          sqlite3_context *pCtx,
                          int nVal,
                          sqlite3_value **apVal)
{
    const char *zPre = (nVal > 0) ? (const char*)sqlite3_value_text(apVal[0]) : "";
    const char *zPost= (nVal > 1) ? (const char*)sqlite3_value_text(apVal[1]) : "";
    const char *zEll = (nVal > 2) ? (const char*)sqlite3_value_text(apVal[2]) : "...";
    int maxToken     = (nVal > 3) ? sqlite3_value_int(apVal[3]) : 11;
    if (!zPre)  zPre  = "";
    if (!zPost) zPost = "";
    if (!zEll)  zEll  = "...";
    if (maxToken <= 0) maxToken = 11;
    int ctxPre  = (maxToken - 1) / 2;
    int ctxPost = maxToken - 1 - ctxPre;

    int rc = SQLITE_OK;
    int nInst = 0;
    int nCol = 0;
    int i;
    ColTokens *aCols = 0;
    sqlite3_str *pStr = 0;

    pStr = sqlite3_str_new(0);
    if (!pStr) { sqlite3_result_error_nomem(pCtx); return; }

    rc = pApi->xInstCount(pFts, &nInst);
    if (rc != SQLITE_OK) goto done;

    if (nInst == 0) goto done;

    nCol = pApi->xColumnCount(pFts);
    aCols = (ColTokens*)sqlite3_malloc(nCol * sizeof(ColTokens));
    if (!aCols) { rc = SQLITE_NOMEM; goto done; }
    memset(aCols, 0, nCol * sizeof(ColTokens));

    for (i = 0; i < nInst; i++) {
        int iPhrase, iCol, iOff;
        int byteStart, byteSize;
        int rs, re;

        rc = pApi->xInst(pFts, i, &iPhrase, &iCol, &iOff);
        if (rc != SQLITE_OK) goto done;

        if (!aCols[iCol].bTokenized) {
            const char *pText = 0;
            int nText = 0;
            rc = pApi->xColumnText(pFts, iCol, &pText, &nText);
            if (rc != SQLITE_OK) goto done;
            if (pText && nText > 0) {
                aCols[iCol].pText = pText;
                aCols[iCol].nText = nText;
                rc = pApi->xTokenize(pFts, pText, nText, &aCols[iCol],
                                     mcsrc_offsets_token_cb);
                if (rc != SQLITE_OK && rc != SQLITE_DONE) goto done;
                rc = SQLITE_OK;
            }
            aCols[iCol].bTokenized = 1;
        }

        if (iOff < 0 || iOff >= aCols[iCol].nPos) continue;

        byteStart = aCols[iCol].aPos[iOff].iStart;
        byteSize  = aCols[iCol].aPos[iOff].iEnd - aCols[iCol].aPos[iOff].iStart;

        /* Compute snippet window [rs, re) in token space around match at iOff */
        rs = iOff - ctxPre;  if (rs < 0) rs = 0;
        re = iOff + ctxPost + 1; if (re > aCols[iCol].nPos) re = aCols[iCol].nPos;

        /* Build snippet into a temp str, then emit header + snippet */
        {
            sqlite3_str *pSnip = sqlite3_str_new(0);
            if (!pSnip) { rc = SQLITE_NOMEM; goto done; }
            if (aCols[iCol].pText && re > rs) {
                const char *pTxt = aCols[iCol].pText;
                TokenPos *aPos   = aCols[iCol].aPos;
                /* leading ellipsis */
                if (rs > 0) sqlite3_str_appendall(pSnip, zEll);
                /* context before match */
                if (rs < iOff)
                    sqlite3_str_append(pSnip, pTxt + aPos[rs].iStart,
                                       aPos[iOff].iStart - aPos[rs].iStart);
                /* matched token wrapped with pre/post */
                sqlite3_str_appendall(pSnip, zPre);
                sqlite3_str_append(pSnip, pTxt + aPos[iOff].iStart,
                                   aPos[iOff].iEnd - aPos[iOff].iStart);
                sqlite3_str_appendall(pSnip, zPost);
                /* context after match */
                if (iOff + 1 < re)
                    sqlite3_str_append(pSnip, pTxt + aPos[iOff].iEnd,
                                       aPos[re - 1].iEnd - aPos[iOff].iEnd);
                /* trailing ellipsis */
                if (re < aCols[iCol].nPos) sqlite3_str_appendall(pSnip, zEll);
            }
            {
                int nSnip = sqlite3_str_length(pSnip);
                char *zSnip = sqlite3_str_finish(pSnip);
                if (!zSnip) { rc = SQLITE_NOMEM; goto done; }
                sqlite3_str_appendf(pStr, "%d %d %d %d %d\n",
                                    iCol, iPhrase, byteStart, byteSize, nSnip);
                sqlite3_str_append(pStr, zSnip, nSnip);
                sqlite3_free(zSnip);
            }
        }
    }

done:
    if (aCols) {
        for (i = 0; i < nCol; i++) sqlite3_free(aCols[i].aPos);
        sqlite3_free(aCols);
    }
    if (rc != SQLITE_OK) {
        sqlite3_free(sqlite3_str_finish(pStr));
        sqlite3_result_error_code(pCtx, rc);
    } else {
        char *zStr = sqlite3_str_finish(pStr);
        if (!zStr) {
            sqlite3_result_error_nomem(pCtx);
        } else {
            sqlite3_result_text(pCtx, zStr, -1, sqlite3_free);
        }
    }
}

// --------------------------------------------------
// ENTRYPOINT

int mcsrc_entry_point(sqlite3 *db, char **pzErrMsg, const struct sqlite3_api_routines *pThunk)
{
	int res;

    fts5_api *fts5 = 0;
    {
        sqlite3_stmt *stmt = 0;
		res = sqlite3_prepare(db, "SELECT fts5(?1)", -1, &stmt, 0);
		if (res != SQLITE_OK) return res;

        sqlite3_bind_pointer(stmt, 1, (void*) &fts5, "fts5_api_ptr", 0);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    if (!fts5) return SQLITE_ERROR;

    res = fts5->xCreateTokenizer_v2(fts5, "mcsrc_tokenizer", 0, &mcsrc_tokenizer, 0);
	if (res != SQLITE_OK) return res;

    res = fts5->xCreateFunction(fts5, "mcsrc_offsets", 0, &mcsrc_offsets, 0);
	if (res != SQLITE_OK) return res;

    return SQLITE_OK;
}

int sqlite3_wasm_extra_init(const char *z)
{
    sqlite3_auto_extension((void*) &mcsrc_entry_point);
    return 0;
}
