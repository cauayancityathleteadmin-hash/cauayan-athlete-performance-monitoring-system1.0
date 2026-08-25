-- Local test metrics for the sport-based assessment screen.
INSERT IGNORE INTO events (sport_id, event_name, description)
SELECT s.id, x.event_name, x.description
FROM sports s JOIN (
    SELECT 'Athletics' sport_name, '100m Sprint' event_name, 'Track sprint assessment' description
    UNION ALL SELECT 'Swimming', '50m Freestyle', 'Pool sprint assessment'
    UNION ALL SELECT 'Basketball', '5x5 Basketball', 'Team basketball assessment'
    UNION ALL SELECT 'Volleyball', 'Indoor Volleyball', 'Indoor volleyball assessment'
) x ON x.sport_name=s.sport_name;

INSERT IGNORE INTO performance_metrics (event_id, metric_name, unit, data_type, better_direction, decimal_places, is_required)
SELECT e.id, x.metric_name, x.unit, x.data_type, x.better_direction, x.decimal_places, 1
FROM events e JOIN sports s ON s.id=e.sport_id JOIN (
    SELECT 'Athletics' sport_name, '100m Sprint' event_name, 'Time' metric_name, 'seconds' unit, 'decimal' data_type, 'lower' better_direction, 2 decimal_places
    UNION ALL SELECT 'Swimming', '50m Freestyle', 'Time', 'seconds', 'decimal', 'lower', 2
    UNION ALL SELECT 'Basketball', '5x5 Basketball', 'Points', 'points', 'integer', 'higher', 0
    UNION ALL SELECT 'Volleyball', 'Indoor Volleyball', 'Points', 'points', 'integer', 'higher', 0
) x ON x.sport_name=s.sport_name AND x.event_name=e.event_name;