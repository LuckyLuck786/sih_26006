import numpy as np

from ml.forecasting.model import create_quantile_model


class QuantileForecastModel:

    def __init__(self):
        self.models = {
            "q10": create_quantile_model(0.10),
            "q50": create_quantile_model(0.50),
            "q90": create_quantile_model(0.90)
        }

    def train(self, X_train, y_train):
        """
        Train all three quantile models.
        """

        print("\nTraining Q10 model...")
        self.models["q10"].fit(X_train, y_train)

        print("Training Q50 model...")
        self.models["q50"].fit(X_train, y_train)

        print("Training Q90 model...")
        self.models["q90"].fit(X_train, y_train)

        print("\nAll quantile models trained successfully!")

    def predict(self, X):
        """
        Generate lower, expected and upper forecasts.
        """

        q10 = self.models["q10"].predict(X)
        q50 = self.models["q50"].predict(X)
        q90 = self.models["q90"].predict(X)

        predictions = {
            "best": q10,
            "expected": q50,
            "worst": q90
        }

        return predictions