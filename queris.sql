CREATE TABLE profile (
id SERIAL PRIMARY KEY,
username VARCHAR(255),
password VARCHAR(255),
name VARCHAR(255),
surname  VARCHAR(255),
age INT,
tel VARCHAR(25),
country VARCHAR(255),
profilimg VARCHAR DEFAULT 'defaultprofil.jpeg'
)


CREATE TABLE saverecipe(
id SERIAL PRIMARY KEY,
user_id INT REFERENCES profile(id) ON DELETE CASCADE,
recipename VARCHAR(255) NOT NULL,
recipe TEXT NOT NULL,
recipevideo TEXT NOT NULL,
missinging TEXT
)