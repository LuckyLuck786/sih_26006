import joblib

MODEL_PATH = "ml/models"


def load_models():

    q10_model = joblib.load(f"{MODEL_PATH}/freight_q10.pkl")

    q50_model = joblib.load(f"{MODEL_PATH}/freight_q50.pkl")

    q90_model = joblib.load(f"{MODEL_PATH}/freight_q90.pkl")

    feature_names = joblib.load(f"{MODEL_PATH}/feature_names.pkl")

    return (q10_model, q50_model, q90_model, feature_names)


def predict_forecast(X):

    q10_model, q50_model, q90_model, feature_names = load_models()

    X = X.reindex(columns=feature_names, fill_value=0)

    q10 = q10_model.predict(X)[0]
    q50 = q50_model.predict(X)[0]
    q90 = q90_model.predict(X)[0]

    return {"best": float(q10), "expected": float(q50), "worst": float(q90)}
