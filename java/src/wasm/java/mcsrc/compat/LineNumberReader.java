package mcsrc.compat;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;

public final class LineNumberReader extends BufferedReader {
    private int lineNumber;

    public LineNumberReader(Reader reader) {
        super(reader);
    }

    @Override
    public String readLine() throws IOException {
        String line = super.readLine();

        if (line != null) {
            lineNumber++;
        }

        return line;
    }

    public int getLineNumber() {
        return lineNumber;
    }
}
