[
  {
    "table_name": "Bitcoiner",
    "constraint_type": "PRIMARY KEY",
    "constraint_name": "Bitcoiner_pkey",
    "column_name": "address",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "LockLike",
    "constraint_type": "FOREIGN KEY",
    "constraint_name": "LockLike_post_id_fkey",
    "column_name": "post_id",
    "referenced_table": "Post",
    "referenced_column": "id"
  },
  {
    "table_name": "LockLike",
    "constraint_type": "FOREIGN KEY",
    "constraint_name": "LockLike_address_fkey",
    "column_name": "address",
    "referenced_table": "Bitcoiner",
    "referenced_column": "address"
  },
  {
    "table_name": "LockLike",
    "constraint_type": "PRIMARY KEY",
    "constraint_name": "LockLike_pkey",
    "column_name": "txid",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "Post",
    "constraint_type": "PRIMARY KEY",
    "constraint_name": "Post_pkey",
    "column_name": "id",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "prediction_market_options",
    "constraint_type": "FOREIGN KEY",
    "constraint_name": "prediction_market_options_txid_fkey",
    "column_name": "txid",
    "referenced_table": "LockLike",
    "referenced_column": "txid"
  },
  {
    "table_name": "prediction_market_options",
    "constraint_type": "FOREIGN KEY",
    "constraint_name": "prediction_market_options_vote_id_fkey",
    "column_name": "vote_id",
    "referenced_table": "votes",
    "referenced_column": "id"
  },
  {
    "table_name": "prediction_market_options",
    "constraint_type": "PRIMARY KEY",
    "constraint_name": "prediction_market_options_pkey",
    "column_name": "id",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "prediction_market_options",
    "constraint_type": "UNIQUE",
    "constraint_name": "prediction_market_options_vote_title_unique",
    "column_name": "vote_id",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "prediction_market_options",
    "constraint_type": "UNIQUE",
    "constraint_name": "prediction_market_options_vote_title_unique",
    "column_name": "vote_id",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "prediction_market_options",
    "constraint_type": "UNIQUE",
    "constraint_name": "prediction_market_options_vote_title_unique",
    "column_name": "title",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "prediction_market_options",
    "constraint_type": "UNIQUE",
    "constraint_name": "prediction_market_options_vote_title_unique",
    "column_name": "title",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "user_preferences",
    "constraint_type": "FOREIGN KEY",
    "constraint_name": "user_preferences_bitcoiner_address_fkey",
    "column_name": "bitcoiner_address",
    "referenced_table": "Bitcoiner",
    "referenced_column": "address"
  },
  {
    "table_name": "user_preferences",
    "constraint_type": "PRIMARY KEY",
    "constraint_name": "user_preferences_pkey",
    "column_name": "user_id",
    "referenced_table": null,
    "referenced_column": null
  },
  {
    "table_name": "votes",
    "constraint_type": "FOREIGN KEY",
    "constraint_name": "votes_post_id_fkey",
    "column_name": "post_id",
    "referenced_table": "Post",
    "referenced_column": "id"
  },
  {
    "table_name": "votes",
    "constraint_type": "PRIMARY KEY",
    "constraint_name": "votes_pkey",
    "column_name": "id",
    "referenced_table": null,
    "referenced_column": null
  }
]