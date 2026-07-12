package br.adv.maiocchi.pades;

final class ProviderException extends RuntimeException {
    final int status;
    final String code;

    ProviderException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
