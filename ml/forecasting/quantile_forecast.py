import logging

from ml.forecasting.model import create_quantile_model

logger = logging.getLogger(__name__)


class QuantileForecastModel:
    def __init__(self):
        self.models = {
            "q10": create_quantile_model(0.10),
            "q50": create_quantile_model(0.50),
            "q90": create_quantile_model(0.90),
        }

    def train(self, X_train, y_train):
        """
        Train all three quantile models.
        """

        logger.info("Training Q10 model")
        self.models["q10"].fit(X_train, y_train)

        logger.info("Training Q50 model")
        self.models["q50"].fit(X_train, y_train)

        logger.info("Training Q90 model")
        self.models["q90"].fit(X_train, y_train)

        logger.info("All quantile models trained")

    def predict(self, X):
        """
        Generate lower, expected and upper forecasts.
        """

        q10 = self.models["q10"].predict(X)
        q50 = self.models["q50"].predict(X)
        q90 = self.models["q90"].predict(X)

        predictions = {"best": q10, "expected": q50, "worst": q90}

        return predictions
