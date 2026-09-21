import lightgbm as lgb


def create_quantile_model(alpha):
    """
    Create a LightGBM quantile regression model.

    alpha:
        0.10 -> lower/best-case forecast
        0.50 -> median/expected forecast
        0.90 -> upper/worst-case forecast
    """

    model = lgb.LGBMRegressor(
        objective="quantile",
        alpha=alpha,
        n_estimators=200,
        learning_rate=0.05,
        num_leaves=15,
        max_depth=-1,
        min_child_samples=10,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        verbosity=-1,
    )

    return model
