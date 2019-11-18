import React from 'react';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';

class PeopleCards extends React.Component {

    render() {

        return (
            <div>
                <div>People</div>
                {this.props.people.map(person => {
                    // startEndArray = verse.verseText.split(this.props.query);
                    return (
                        <Card key={"container" + person.slug}>
                            <CardContent>
                                <Typography>{person.name}</Typography>
                                <Typography>
                                    {person.verseCount + " verses. First mentioned in " + person.verses[0].fullRef}
                                </Typography>
                                    {/*
                                        <TextBold style={{ display: 'inline' }} text={" " + this.props.query + " "}></TextBold>
                                        <TextRegular style={{ display: 'inline' }} text={startEndArray[1]}></TextRegular>
                                    */}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
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