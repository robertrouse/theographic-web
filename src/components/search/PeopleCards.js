import React from 'react';
import Grid from '@material-ui/core/Grid';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';
import { Link } from 'gatsby';

class PeopleCards extends React.Component {

    render() {

        return (
            <Grid container 
                spacing={2}
                direction="column"
            >
                <Grid item>
                    <Typography variant="button" display="block" >People</Typography>
                </Grid>
                
                {this.props.people.map(person => {
                    // startEndArray = verse.verseText.split(this.props.query);
                    return (
                        <Grid item key={"container" + person.slug}>
                            <Card>
                                <CardContent>
                                    <Link to={'/person/' + person.slug}>
                                        <Typography>{person.name}</Typography>
                                    </Link>
                                    <Typography>
                                        {person.verseCount + " verses. First mentioned in " + person.verses[0].fullRef}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    )
                })}
            </Grid>
        );
    }
}

// const styles = StyleSheet.create({
//     personCard: {
//         marginBottom: 15,
//         borderRadius: 10,
//         padding: 15
//     },
//     name: {
//         color: 'blue',
//         fontSize: 18,
//         fontFamily: 'Roboto'
//     },
// })

export default PeopleCards